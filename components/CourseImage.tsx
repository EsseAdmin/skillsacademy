import type { Course, Template } from "@/lib/queries";
import CourseArt from "@/components/CourseArt";
import { pickArt, usesDefaultEmoji } from "@/lib/courseArt";

// A course's picture: the uploaded cover, else (when no emoji was chosen) a
// default picture matched to the topic, else the emoji the admin picked on a
// branded panel. Fills its parent (give the parent the aspect ratio).
export default function CourseImage({
  course,
  template,
  emojiSize = "text-5xl",
}: {
  course: Pick<Course, "id" | "title" | "category" | "description" | "cover_emoji" | "cover_image_path" | "updated_at">;
  template: Pick<Template, "primary_color" | "secondary_color" | "accent_color">;
  emojiSize?: string;
}) {
  if (course.cover_image_path) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/courses/${course.id}/cover?v=${encodeURIComponent(course.updated_at)}`} alt="" className="w-full h-full object-cover" />
    );
  }
  if (usesDefaultEmoji(course.cover_emoji)) {
    return (
      <CourseArt
        kind={pickArt(course.title, course.category, course.description)}
        primary={template.primary_color}
        secondary={template.secondary_color}
        accent={template.accent_color}
      />
    );
  }
  return (
    <div className={`w-full h-full flex items-center justify-center ${emojiSize}`} style={{ background: `linear-gradient(135deg, ${template.primary_color}, ${template.secondary_color})` }}>
      <span aria-hidden="true">{course.cover_emoji}</span>
    </div>
  );
}
