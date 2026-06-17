/** @type {import('next').NextConfig} */

const routing = require("./routing.config.json");

function buildRewrites() {
  const rewrites = [];

  for (const { slug, path } of routing.routes) {
    for (const host of routing.subdomainBaseHosts) {
      rewrites.push({
        source: "/:path((?!_next|api|images|og|screenshots).*)",
        has: [{ type: "host", value: `${slug}.${host}` }],
        destination: `${path}/:path*`,
      });
    }
  }

  for (const host of routing.redirectBaseHosts) {
    rewrites.push({
      source: "/:path((?!_next|api|images|og|screenshots|go).*)",
      has: [{ type: "host", value: host }],
      destination: "/go?__wc_path=:path*",
    });

    for (const { slug, path } of routing.routes) {
      rewrites.push({
        source: "/:path((?!_next|api|images|og|screenshots|go).*)",
        has: [{ type: "host", value: `${slug}.${host}` }],
        destination: `/go?__wc_prefix=${path}&__wc_path=:path*`,
      });
    }

    for (const slug of routing.retiredSubdomainSlugs) {
      rewrites.push({
        source: "/:path((?!_next|api|images|og|screenshots|go).*)",
        has: [{ type: "host", value: `${slug}.${host}` }],
        destination: "/go?__wc_path=",
      });
    }
  }

  return rewrites;
}

function buildRedirects() {
  const redirects = [];

  for (const host of routing.subdomainBaseHosts) {
    for (const slug of routing.retiredSubdomainSlugs) {
      redirects.push({
        source: "/:path*",
        has: [{ type: "host", value: `${slug}.${host}` }],
        destination: `https://${host}`,
        permanent: false,
      });
    }
  }

  return redirects;
}

function buildHeaders() {
  const headers = [];

  for (const host of routing.pathBaseHosts) {
    headers.push({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
    });
  }

  for (const host of routing.redirectBaseHosts) {
    headers.push({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    });

    for (const { slug } of routing.routes) {
      headers.push({
        source: "/:path*",
        has: [{ type: "host", value: `${slug}.${host}` }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      });
    }

    for (const slug of routing.retiredSubdomainSlugs) {
      headers.push({
        source: "/:path*",
        has: [{ type: "host", value: `${slug}.${host}` }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      });
    }
  }

  return headers;
}

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@walletchan/shared"],
  async headers() {
    return buildHeaders();
  },
  async redirects() {
    return buildRedirects();
  },
  async rewrites() {
    return {
      beforeFiles: buildRewrites(),
    };
  },
};

module.exports = nextConfig;
