import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";

async function run() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [join(process.cwd(), "dist/src/index.js")],
  });
  
  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  }, {
    capabilities: {}
  });
  
  await client.connect(transport);
  console.log("Connected");
  
  const tools = await client.listTools();
  console.dir(tools.tools.map(t => t.name), { depth: null });
  
  await client.close();
}

run().catch(console.error);
