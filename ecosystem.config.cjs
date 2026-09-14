module.exports = {
  apps: [
    {
      name: "fisczim",
      script: "dist/index.cjs",
      interpreter: "node",
      cwd: "/var/www/fisczim",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        DATABASE_URL: "postgresql://user:password@localhost:5432/fisczim"
      }
    },
    {
      name: "fiscalstack_lesotho",
      script: "dist/index.cjs",
      interpreter: "node",
      cwd: "/var/www/fisczim",
      env: {
        NODE_ENV: "production",
        PORT: 5002,
        COUNTRY_SCOPE: "lesotho",
        DATABASE_URL: "postgresql://user:password@localhost:5432/fisczim"
      }
    }
  ]
};

