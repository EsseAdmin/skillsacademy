import type { ModuleRow } from "@/lib/queries";
import CourseArt from "@/components/CourseArt";
import { pickArt } from "@/lib/courseArt";

// A module's picture: the uploaded one, or a default matched to its title.
export default function ModuleThumb({
  mod,
  colors,
  className = "w-16 h-10",
}: {
  mod: Pick<ModuleRow, "id" | "title" | "description" | "image_path" | "updated_at">;
  colors: { primary: string; secondary: string; accent: string };
  className?: string;
}) {
  return (
    <div className={`${className} rounded-md overflow-hidden flex-shrink-0 border border-gray-200`} data-testid="module-thumb">
      {mod.image_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/modules/${mod.id}/image?v=${encodeURIComponent(mod.updated_at)}`} alt="" className="w-full h-full object-cover" />
      ) : (
        <CourseArt kind={pickArt(mod.title, "", mod.description)} primary={colors.primary} secondary={colors.secondary} accent={colors.accent} />
      )}
    </div>
  );
}
