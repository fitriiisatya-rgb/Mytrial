/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // bank-book CSV/XLSX uploads
    },
  },
};

export default nextConfig;
