import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as cloudflare from "@pulumi/cloudflare";
import { build } from "esbuild";
import * as fs from "fs";
import { config } from "dotenv";

config();

if (
	!process.env.DATABASE_URL_PROD ||
	!process.env.DATABASE_URL_STAGING ||
	!process.env.GIT_PAT
) {
	throw new Error("Please set DATABASE_URL and GIT_PAT in .env file");
}

const pulumiConfig = new pulumi.Config();
const projectId = "develop-436107";
const projectNumber = "1022174569886";
const region = "asia-northeast1";
const buildRegion = "asia-east1";
const cloudRunServiceName = "todo";
const githubRepositoryName = "pulumi-google-cloud-remix";
const workersServiceName = "proxy";
const productionTag = "prod"
const stagingTag = "stg"
const artifactRegistryId = "cloud-run-source-artifact-registry"
// Account
const cloud_build_service_account = new gcp.serviceaccount.Account(
	"cloud-build-service-account",
	{
		accountId: "cloud-build-service-account",
		description: "Cloud build service account",
		displayName: "cloud-build-service-account",
		project: projectId,
	},
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
		secretData: process.env.GIT_PAT,
	},
);
const database_url_prod_secret = new gcp.secretmanager.Secret(
	`database-url-${productionTag}-secret`,
	{
		secretId: `database-url-${productionTag}-secret`,
		replication: {
			userManaged: {
				replicas: [{ location: region }, { location: buildRegion }],
			},
		},
	},
);
new gcp.secretmanager.SecretVersion(`database-url-${productionTag}-secret-version`, {
	secret: database_url_prod_secret.name,
	secretData: process.env.DATABASE_URL_PROD,
});
const database_url_staging_secret = new gcp.secretmanager.Secret(
	`database-url-${stagingTag}-secret`,
	{
		secretId: `database-url-${stagingTag}-secret`,
		replication: {
			userManaged: {
				replicas: [{ location: region }, { location: buildRegion }],
			},
		},
	},
);
new gcp.secretmanager.SecretVersion(`database-url-${stagingTag}-secret-version`, {
	secret: database_url_staging_secret.name,
	secretData: process.env.DATABASE_URL_STAGING,
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
new gcp.secretmanager.SecretIamBinding(
	`database-url-${productionTag}-secret-accessor-iam`,
	{
		project: database_url_prod_secret.project,
		secretId: database_url_prod_secret.secretId,
		role: "roles/secretmanager.secretAccessor",
		members: [
			"serviceAccount:service-1022174569886@gcp-sa-cloudbuild.iam.gserviceaccount.com",
			pulumi.interpolate`serviceAccount:${cloud_build_service_account.email}`,
		],
	},
);
new gcp.secretmanager.SecretIamBinding(
	`database-url-${stagingTag}-secret-accessor-iam`,
	{
		project: database_url_staging_secret.project,
		secretId: database_url_staging_secret.secretId,
		role: "roles/secretmanager.secretAccessor",
		members: [
			"serviceAccount:service-1022174569886@gcp-sa-cloudbuild.iam.gserviceaccount.com",
			pulumi.interpolate`serviceAccount:${cloud_build_service_account.email}`,
		],
	},
);

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
	repositoryId: artifactRegistryId,
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
	},
);
const github_project_repository = new gcp.cloudbuildv2.Repository(
	"github-project-repository",
	{
		location: buildRegion,
		name: githubRepositoryName,
		parentConnection: github_repository_connection.id,
		project: projectId,
		remoteUri: `https://github.com/sendo-kakeru/${githubRepositoryName}.git`,
	},
);
new gcp.cloudbuild.Trigger(`cloud-build-trigger-${productionTag}`, {
	filename: "pulumi/cloudbuild.yaml",
	location: buildRegion,
	name: `${cloudRunServiceName}-trigger-${productionTag}`,
	project: projectId,
	repositoryEventConfig: {
		push: {
			branch: "^main$",
		},
		repository: github_project_repository.id,
	},
  substitutions: {
    _NODE_ENV: "production",
    _SERVICE_NAME:`todo-${productionTag}`,
    _MIGRATE_JOB_NAME: `todo-migration-job-${productionTag}`,
    _SEED_JOB_NAME: `todo-seed-job-${productionTag}`,
    _DEPLOY_REGION: region,
    _AR_HOSTNAME: "asia-northeast1-docker.pkg.dev",
    _PLATFORM: "managed",
    _ARTIFACT_REGISTRY: artifactRegistryId,
    _PROJECT_NUMBER: projectNumber,
  },
	tags: [
		"gcp-cloud-build-deploy-cloud-run",
		"gcp-cloud-build-deploy-cloud-run-managed",
		`tod-${productionTag}`,
	],
	serviceAccount: pulumi.interpolate`projects/${projectId}/serviceAccounts/${cloud_build_service_account.email}`,
});
new gcp.cloudbuild.Trigger(`cloud-build-trigger-${stagingTag}`, {
	filename: "pulumi/cloudbuild.yaml",
	location: buildRegion,
	name: `${cloudRunServiceName}-trigger-${stagingTag}`,
	project: projectId,
	repositoryEventConfig: {
		push: {
			branch: "^develop$",
		},
		repository: github_project_repository.id,
	},
  substitutions: {
    _NODE_ENV: "staging",
    _SERVICE_NAME:`todo-${stagingTag}`,
    _MIGRATE_JOB_NAME: `todo-migration-job-${stagingTag}`,
    _SEED_JOB_NAME: `todo-seed-job-${stagingTag}`,
    _DEPLOY_REGION: region,
    _AR_HOSTNAME: "asia-northeast1-docker.pkg.dev",
    _PLATFORM: "managed",
    _ARTIFACT_REGISTRY: artifactRegistryId,
    _PROJECT_NUMBER: projectNumber,
  },
	tags: [
		"gcp-cloud-build-deploy-cloud-run",
		"gcp-cloud-build-deploy-cloud-run-managed",
		`tod-${stagingTag}`,
	],
	serviceAccount: pulumi.interpolate`projects/${projectId}/serviceAccounts/${cloud_build_service_account.email}`,
});

(async () => {
	const todoCloudRunServiceProd = await gcp.cloudrun.getService({
		name: `${cloudRunServiceName}-${productionTag}`,
		location: region,
	});
	const todoCloudRunServiceStaging = await gcp.cloudrun.getService({
		name: `${cloudRunServiceName}-${stagingTag}`,
		location: region,
	});

	// cloudflare
	const accountId = pulumiConfig.require("accountId");
	const zoneId = pulumiConfig.require("zoneId");
	const domain = pulumiConfig.require("domain");

	await build({
		entryPoints: ["../proxies/src/index.ts"],
		platform: "node",
		bundle: true,
		outfile: "../proxies/dist/worker.js",
		format: "esm",
		minify: true,
	});

	new cloudflare.WorkersScript("proxy-workers-script", {
		accountId: accountId,
		name: workersServiceName,
		content: fs.readFileSync("../proxies/dist/worker.js", "utf8"),
		module: true,
		plainTextBindings: [
			{
				name: "ORIGIN_URL_PROD",
				text: todoCloudRunServiceProd.statuses[0].url,
			},
			{
				name: "ORIGIN_URL_STAGING",
				text: todoCloudRunServiceStaging.statuses[0].url,
			},
		],
	});
	new cloudflare.WorkersDomain(`proxy-workers-domain-${productionTag}`, {
		accountId,
		hostname: `proxy-prod.${domain}`,
		service: workersServiceName,
		zoneId,
	});
	new cloudflare.WorkersDomain(`proxy-workers-domain-${stagingTag}`, {
		accountId,
		hostname: `proxy-staging.${domain}`,
		service: workersServiceName,
		zoneId,
	});
})();
