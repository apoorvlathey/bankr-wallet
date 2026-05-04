/** @type {import('next').NextConfig} */

// Subdomain rewrites are mirrored across these TLDs. Add a new TLD here once
// it's configured in Vercel and DNS, and every rewrite below will pick it up.
const SUBDOMAIN_TLDS = ["walletchan.com", "walletchan.xyz"];

const SUBDOMAIN_REWRITES = [
  // coins.* rewrite removed (redirects to homepage now)
  { slug: "stake" },
  { slug: "migrate" },
  { slug: "admin" },
  { slug: "compare" },
  { slug: "mainnet" },
  { slug: "os" },
  { slug: "test" },
];

function buildRewrites() {
  const rewrites = [];
  for (const { slug } of SUBDOMAIN_REWRITES) {
    for (const tld of SUBDOMAIN_TLDS) {
      rewrites.push({
        source: "/:path((?!_next|api|images|og|screenshots).*)",
        has: [{ type: "host", value: `${slug}.${tld}` }],
        destination: `/${slug}/:path*`,
      });
    }
  }
  return rewrites;
}

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@walletchan/shared"],
  async redirects() {
    return [
      // Redirect coins subdomains -> homepage (coins page discontinued)
      {
        source: "/:path*",
        has: [{ type: "host", value: "coins.bankrwallet.app" }],
        destination: "https://walletchan.com",
        permanent: false,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "coins.walletchan.com" }],
        destination: "https://walletchan.com",
        permanent: false,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "coins.walletchan.xyz" }],
        destination: "https://walletchan.xyz",
        permanent: false,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "stake.bankrwallet.app" }],
        destination: "https://stake.walletchan.com/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "migrate.bankrwallet.app" }],
        destination: "https://migrate.walletchan.com/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "admin.bankrwallet.app" }],
        destination: "https://admin.walletchan.com/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "compare.bankrwallet.app" }],
        destination: "https://compare.walletchan.com/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "mainnet.bankrwallet.app" }],
        destination: "https://mainnet.walletchan.com/:path*",
        permanent: true,
      },
      // Redirect bankrwallet.app -> walletchan.com (main domain, must be last)
      {
        source: "/:path*",
        has: [{ type: "host", value: "bankrwallet.app" }],
        destination: "https://walletchan.com/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: buildRewrites(),
    };
  },
};

module.exports = nextConfig;
