/** @type {import('next').NextConfig} */
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(path.resolve(process.cwd(), "../.."));

const nextConfig = {
	transpilePackages: ["@daam/contracts"],
};

export default nextConfig;
