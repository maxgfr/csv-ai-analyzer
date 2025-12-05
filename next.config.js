/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
    // Enable static export for GitHub Pages
    output: "export",

    // Base path for GitHub Pages (repository name)
    // Set via NEXT_PUBLIC_BASE_PATH env var in GitHub Actions
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",

    // Disable image optimization for static export
    images: {
        unoptimized: true,
    },

    // Trailing slash for GitHub Pages compatibility
    trailingSlash: true,
};

export default config;
