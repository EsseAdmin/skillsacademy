// Deleting a module for good: its stored files, the files behind its activity data, any items inside its sections,
// then the row (which cascades to completions, sections and the rest).
import { Modules, ModuleItems, type ModuleRow } from "@/lib/queries";
import { deleteFile } from "@/lib/storage";
import { purgeActivityFiles } from "@/lib/actions/activities";

export async function removeModuleCompletely(mod: ModuleRow): Promise<void> {
  for (const child of await ModuleItems.listByParent(mod.id)) await removeModuleCompletely(child);
  if (mod.file_path) {
    try {
      await deleteFile(mod.file_path);
    } catch {
      /* a missing blob must not block the delete */
    }
  }
  if (mod.image_path) {
    try {
      await deleteFile(mod.image_path);
    } catch {
      /* an orphaned picture is harmless */
    }
  }
  await purgeActivityFiles(mod); // folder files and assignment hand-ins
  await Modules.remove(mod.id);
}
