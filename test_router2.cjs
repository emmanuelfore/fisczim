const express = require("express");
const app = express();
app.use("/api/zimra", (req, res, next) => {
  // when using app.use('/prefix'), req.url is the path AFTER the prefix
  req.url = `/api/companies/86/zimra${req.url}`;
  // We must call app.handle again from the top because the current router level assumes the prefix is stripped
  app.handle(req, res);
});
app.post("/api/companies/:id/zimra/ping", (req, res) => res.send("Success " + req.params.id));
app.listen(5003, () => console.log("Started"));
