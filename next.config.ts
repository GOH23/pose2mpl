import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    webpack: (config, { isServer }) => {
        config.module.rules.push({
            test: /\.wgsl$/,
            type: 'asset/source', // Loads file contents as raw string
        });
        return config;
    },
};

export default nextConfig;
