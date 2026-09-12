import "dotenv/config";
import { userHasPermission, getUserPermissions } from "../server/lib/permissions";
import { pool } from "../server/db";

async function main() {
    const userId = "b31c9ebb-9483-4cd3-bc0b-50232e9c0283";
    const companyId = 2;
    const hasPerm = await userHasPermission(userId, companyId, "bus.view", false);
    const allPerms = await getUserPermissions(userId, companyId, false);
    console.log("hasPerm:", hasPerm);
    console.log("allPerms array size:", Array.from(allPerms).length);
    console.log("has bus.view?", allPerms.has("bus.view"));
    console.log("first 5 perms:", Array.from(allPerms).slice(0, 5));
    pool.end();
}

main();
