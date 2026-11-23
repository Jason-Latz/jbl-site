/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "query", key: "focus", value: "(?<focus>records|work|reading|notes|chess)" }],
        destination: "/desk?focus=:focus",
        permanent: false
      },
      {
        source: "/",
        has: [{ type: "query", key: "baked", value: "(?<baked>0|1)" }],
        destination: "/desk?baked=:baked",
        permanent: false
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/desk-static-:hash.glb",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      },
      {
        source: "/home-desk-:layout(desktop|tablet|mobile)-:theme(light|dark)-v:version(\\d+).webp",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      },
      {
        source: "/home-desk-controls-v:version(\\d+).webp",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
