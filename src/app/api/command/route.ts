import { body, ok, failure, rateLimit } from "@/lib/http";
import { authenticated } from "@/lib/supabase/server";
import { commandSchema, urlSchema } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    const command = commandSchema.parse(await body(request));
    const { client, user } = await authenticated(command.type === "admin");
    await rateLimit(request, "command", user.id, 180);
    let result;
    if (command.type === "create")
      result = await client.rpc("create_chatbot", {
        p_id: command.id,
        p_generation: command.generation,
        p_title: command.title,
        p_url: command.url,
        p_additional: command.additional_data,
      });
    else if (command.type === "edit")
      result = await client.rpc("edit_chatbot", {
        p_id: command.id,
        p_version: command.version,
        p_title: command.title,
        p_url: command.url,
        p_additional: command.additional_data,
      });
    else if (command.type === "confirm")
      result = await client.rpc("confirm_chatbot", {
        p_id: command.id,
        p_step: command.step,
        p_generation: command.generation,
        p_version: command.version,
      });
    else {
      if (command.operation === "chatbot_correct")
        urlSchema.parse(command.payload.deployment_url);
      result = await client.rpc("admin_command", {
        p_operation: command.operation,
        p_payload: command.payload,
        p_request_id: command.request_id,
      });
    }
    if (result.error) throw result.error;
    return ok({ result: result.data });
  } catch (error) {
    return failure(error);
  }
}
