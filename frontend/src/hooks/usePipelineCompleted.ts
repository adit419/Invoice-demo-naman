import { useEffect, useState } from "react";
import { stagesService } from "@/services";

export function usePipelineCompleted(invoiceId: string | undefined): boolean {
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!invoiceId) return;
    stagesService.pipelineStatus(invoiceId)
      .then(res => setCompleted(res.pipeline_status === "completed"))
      .catch(() => {});
  }, [invoiceId]);

  return completed;
}
