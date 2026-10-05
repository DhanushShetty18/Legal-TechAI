import FormHydration from "@/components/FormHydration";

export default function FormHydrationPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-extrabold text-slate-900">Court Form Hydration</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        The OCR extractor is meant to read a camera photo and drop the words into a court form.
        This page does the last step only: labeled lines become fields. It does not call the camera
        or Gemini.
      </p>
      <div className="mt-8">
        <FormHydration />
      </div>
    </main>
  );
}
