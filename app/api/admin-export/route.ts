import { adminExportTypes, buildAdminCsvExport, isAdminExportType } from "../../../lib/adminExport";
import { getRepository } from "../../../lib/repository";
import { requestCan } from "../../../lib/serverAuth";

export async function GET(request: Request) {
  if (!(await requestCan(request, "admin_read"))) {
    return Response.json({ ok: false, message: "Admin export requires an admin role." }, { status: 403 });
  }

  const type = new URL(request.url).searchParams.get("type");
  if (!isAdminExportType(type)) {
    return Response.json(
      {
        ok: false,
        message: "Unknown export type.",
        allowedTypes: adminExportTypes,
      },
      { status: 400 },
    );
  }

  const state = await getRepository().getAdminState();
  const exportFile = buildAdminCsvExport(state, type);

  return new Response(`\uFEFF${exportFile.csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFile.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
