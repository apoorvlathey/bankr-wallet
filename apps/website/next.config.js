/** @type {import('next').NextConfig} */
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
      beforeFiles: [
        // coins.walletchan.com rewrite removed (redirects to homepage now)
        // stake.walletchan.com -> /stake
        {
          source: "/:path((?!_next|api|images|og|screenshots).*)",
          has: [
            {
              type: "host",
              value: "stake.walletchan.com",
            },
          ],
          destination: "/stake/:path*",
        },
        // migrate.walletchan.com -> /migrate
        {
          source: "/:path((?!_next|api|images|og|screenshots).*)",
          has: [
            {
              type: "host",
              value: "migrate.walletchan.com",
            },
          ],
          destination: "/migrate/:path*",
        },
        // admin.walletchan.com -> /admin
        {
          source: "/:path((?!_next|api|images|og|screenshots).*)",
          has: [
            {
              type: "host",
              value: "admin.walletchan.com",
            },
          ],
          destination: "/admin/:path*",
        },
        // compare.walletchan.com -> /compare
        {
          source: "/:path((?!_next|api|images|og|screenshots).*)",
          has: [
            {
              type: "host",
              value: "compare.walletchan.com",
            },
          ],
          destination: "/compare/:path*",
        },
        // mainnet.walletchan.com -> /mainnet
        {
          source: "/:path((?!_next|api|images|og|screenshots).*)",
          has: [
            {
              type: "host",
              value: "mainnet.walletchan.com",
            },
          ],
          destination: "/mainnet/:path*",
        },
        // os.walletchan.com -> /os
        {
          source: "/:path((?!_next|api|images|og|screenshots).*)",
          has: [
            {
              type: "host",
              value: "os.walletchan.com",
            },
          ],
          destination: "/os/:path*",
        },
        // test.walletchan.com -> /test
        {
          source: "/:path((?!_next|api|images|og|screenshots).*)",
          has: [
            {
              type: "host",
              value: "test.walletchan.com",
            },
          ],
          destination: "/test/:path*",
        },
      ],
    };
  },
};

module.exports = nextConfig;
