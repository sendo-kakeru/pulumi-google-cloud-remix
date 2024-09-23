import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as std from "@pulumi/std";
import * as cloudflare from "@pulumi/cloudflare";
import { build } from "esbuild";
import * as fs from "fs";

const config = new pulumi.Config();
const projectId = "develop-436107";
const projectNumber = 1022174569886;
const region = "asia-northeast1";
const buildRegion = "us-central1";
const cloudRunServiceName = "todo";
const githubRepositoryName = "pulumi-google-cloud-remix";
const cloudflareAccountId = "bd8de93d9aeb8fc006b2eb675d23920d";

// Account
const cloud_build_service_account = new gcp.serviceaccount.Account(
  "cloud-build-service-account",
  {
    accountId: "cloud-build-service-account",
    description: "Cloud build service account",
    displayName: "cloud-build-service-account",
    project: projectId,
  }
);

// Secret Manager
const github_token_secret = new gcp.secretmanager.Secret("github-pat-secret", {
  secretId: "github-pat-secret",
  replication: {
    userManaged: {
      replicas: [{ location: region }, { location: buildRegion }],
    },
  },
});
const github_token_secret_version = new gcp.secretmanager.SecretVersion(
  "github-pat-secret-version",
  {
    secret: github_token_secret.name,
    secretData: std
      .file({
        input: "secrets/github-pat.txt",
      })
      .then((invoke) => invoke.result),
  }
);
const database_url_secret = new gcp.secretmanager.Secret(
  "database-url-secret",
  {
    secretId: "database-url-secret",
    replication: {
      userManaged: {
        replicas: [{ location: region }, { location: buildRegion }],
      },
    },
  }
);
new gcp.secretmanager.SecretVersion("database-url-secret-version", {
  secret: database_url_secret.name,
  secretData: std
    .file({
      input: "secrets/database-url.txt",
    })
    .then((invoke) => invoke.result),
});

// Secret Manager IAM
new gcp.secretmanager.SecretIamBinding("github-pat-secret-accessor-iam", {
  project: github_token_secret.project,
  secretId: github_token_secret.secretId,
  role: "roles/secretmanager.secretAccessor",
  members: [
    "serviceAccount:service-1022174569886@gcp-sa-cloudbuild.iam.gserviceaccount.com",
    pulumi.interpolate`serviceAccount:${cloud_build_service_account.email}`,
  ],
});
new gcp.secretmanager.SecretIamBinding("database-url-secret-accessor-iam", {
  project: database_url_secret.project,
  secretId: database_url_secret.secretId,
  role: "roles/secretmanager.secretAccessor",
  members: [
    "serviceAccount:service-1022174569886@gcp-sa-cloudbuild.iam.gserviceaccount.com",
    pulumi.interpolate`serviceAccount:${cloud_build_service_account.email}`,
  ],
});

// IAM
new gcp.projects.IAMBinding("service-account-user-iam", {
  role: "roles/iam.serviceAccountUser",
  project: projectId,
  members: [
    pulumi.interpolate`serviceAccount:${cloud_build_service_account.email}`,
  ],
});
new gcp.projects.IAMBinding("log-writer-iam", {
  role: "roles/logging.logWriter",
  project: projectId,
  members: [
    pulumi.interpolate`serviceAccount:${cloud_build_service_account.email}`,
  ],
});
new gcp.projects.IAMMember("cloud-build-builder-iam", {
  project: projectId,
  member: pulumi.interpolate`serviceAccount:${cloud_build_service_account.email}`,
  role: "roles/cloudbuild.builds.builder",
});
new gcp.projects.IAMBinding("cloud-run-admin-iam", {
  role: "roles/run.admin",
  project: projectId,
  members: [
    pulumi.interpolate`serviceAccount:${cloud_build_service_account.email}`,
  ],
});

// Build
new gcp.artifactregistry.Repository("cloud-run-source-artifact-registry", {
  location: region,
  repositoryId: "cloud-run-source-artifact-registry",
  description: "Cloud Run docker repository",
  format: "DOCKER",
  dockerConfig: {
    immutableTags: true,
  },
});
const github_repository_connection = new gcp.cloudbuildv2.Connection(
  "github-repository-connection",
  {
    githubConfig: {
      appInstallationId: 54910727,
      authorizerCredential: {
        oauthTokenSecretVersion: github_token_secret_version.id,
      },
    },
    location: buildRegion,
    name: "sendo-kakeru",
    project: projectId,
  }
);
const github_project_repository = new gcp.cloudbuildv2.Repository(
  "github-project-repository",
  {
    location: buildRegion,
    name: githubRepositoryName,
    parentConnection: github_repository_connection.id,
    project: projectId,
    remoteUri: `https://github.com/sendo-kakeru/${githubRepositoryName}.git`,
  }
);
new gcp.cloudbuild.Trigger("cloud-build-trigger", {
  filename: "cloudbuild.yaml",
  location: buildRegion,
  name: `${cloudRunServiceName}-app-trigger`,
  project: projectId,
  repositoryEventConfig: {
    push: {
      branch: "^main$",
    },
    repository: github_project_repository.id,
  },
  serviceAccount: pulumi.interpolate`projects/${projectId}/serviceAccounts/${cloud_build_service_account.email}`,
});

(async () => {
  const todoCloudRunService = await gcp.cloudrun.getService({
    name: "todo",
    location: region,
  });

  // cloudflare
  const accountId = config.require("accountId");
  const zoneId = config.require("zoneId");
  const domain = config.require("domain");

  await build({
    entryPoints: ["../proxies/src/index.ts"],
    logLevel: "info",
    platform: "node",
    bundle: true,
    outfile: "../proxies/dist/worker.js",
    target: "es2020",
    format: "esm",
    minify: true,
  });

  const script = new cloudflare.WorkersScript("proxy-workers-script", {
    accountId: accountId,
    name: "proxy",
    content: fs.readFileSync("../proxies/dist/worker.js", "utf8"),
    module: true,
  });
  new cloudflare.WorkersRoute("proxy-workers-route", {
    zoneId: zoneId,
    pattern: "proxy-workers." + domain,
    scriptName: script.name,
  });
  new cloudflare.WorkersSecret("origin-url-workers-secret", {
    accountId: accountId,
    name: "ORIGIN_URL",
    scriptName: script.name,
    secretText: todoCloudRunService.statuses[0].url,
  });
})();
