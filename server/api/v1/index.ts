import { Router } from "express";
import { resolveApiKey } from "./middleware.js";
import fiscalizeRouter from "./fiscalize.js";
import invoicesRouter from "./invoices.js";
import customersRouter from "./customers.js";
import productsRouter from "./products.js";
import fiscalRouter from "./fiscal.js";
import companyRouter from "./company.js";
import webhooksRouter from "./webhooks.js";
import busTicketingRouter from "./bus-ticketing.js";
import zohoExtensionRouter from "./zoho-extension.js";

const v1Router = Router();

// Webhooks are exempt from API key auth (use their own signature verification)
v1Router.use("/webhooks", webhooksRouter);

// All other routes require API key authentication
v1Router.use(resolveApiKey);
v1Router.use("/fiscalize", fiscalizeRouter);
v1Router.use("/invoices", invoicesRouter);
v1Router.use("/customers", customersRouter);
v1Router.use("/products", productsRouter);
v1Router.use("/fiscal", fiscalRouter);
v1Router.use("/company", companyRouter);
v1Router.use("/bus-ticketing", busTicketingRouter);
v1Router.use("/zoho-extension", zohoExtensionRouter);

export default v1Router;
