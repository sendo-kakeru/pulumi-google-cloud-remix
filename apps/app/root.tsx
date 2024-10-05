import {
	json,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "@remix-run/react";
import type {
	ActionFunctionArgs,
	LinksFunction,
	LoaderFunctionArgs,
} from "@remix-run/node";
import "./tailwind.css";

export const links: LinksFunction = () => [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
	},
];

export async function loader({ request }: LoaderFunctionArgs) {
	console.log("NODE_ENV", process.env.NODE_ENV);
	if (
		process.env.NODE_ENV === "production" &&
		request.headers.get("X-Forwarded-Host") !== "proxy-prod.okashibu.com"
	) {
		throw json({ message: "Bad Request" }, { status: 400 });
	}
	return json({});
}

export async function action({ request }: ActionFunctionArgs) {
	if (
		process.env.NODE_ENV === "production" &&
		request.headers.get("X-Forwarded-Host") !== "proxy-prod.okashibu.com"
	) {
		throw json({ message: "Bad Request" }, { status: 400 });
	}
	return json({});
}

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				<p>{JSON.stringify(import.meta.env)}</p>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}
