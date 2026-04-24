module.exports = {
  apps: [
    {
      name: "fintech-api",
      script: "src/server.js",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
