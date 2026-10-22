import { useFormContext, useWatch } from "react-hook-form";
import { HsCodeAssistant } from "./hs-code-assistant";

export function HsCodeAssistantWrapper() {
  const { control, setValue } = useFormContext();
  const name = useWatch({ control, name: "name" }) || "";
  const category = useWatch({ control, name: "category" }) || "";
  const description = useWatch({ control, name: "description" }) || "";
  
  return (
    <HsCodeAssistant
      initialQuery={[name, category, description].filter(Boolean).join(" ")}
      onSelect={(code) => setValue("hsCode", code, { shouldDirty: true, shouldValidate: true })}
    />
  );
}
