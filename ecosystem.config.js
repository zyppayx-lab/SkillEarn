module.exports = {
  apps: [
    {
      name: "skillearn-api",
      script: "server.js",
      instances: "max",
      exec_mode: "cluster",
      watch: false,

      env: {
        NODE_ENV: "production",
        PORT: 5000
      },

      max_memory_restart: "500M",

      error_file: "./logs/error.log",
      out_file: "./logs/output.log",
      log_date_format:
        "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
