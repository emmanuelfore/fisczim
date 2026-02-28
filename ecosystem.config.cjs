module.exports = {
  apps: [
    {
      name: "fiscalzone",
      script: "dist/index.cjs",
      interpreter: "node",
      cwd: "/var/www/fiscalzone/fisczim",
      env: {
        NODE_ENV: "production",
        PORT: 5001,
        DATABASE_URL: "postgresql://user:password@localhost:5432/fisczim"
      }
    }
  ]
};

