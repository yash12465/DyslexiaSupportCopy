const About = () => {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-2xl font-semibold">About DyslexiaSupportCopy</h2>
      <p className="mt-3 leading-7 text-slate-700">
        This version focuses on accessibility-first reading support: automatic text analysis, explainable confidence,
        and live canvas previews that help tune spacing, font size, and background comfort.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700">
        <li>Automatic debounce-driven analysis workflow.</li>
        <li>Configurable thresholds and confidence annotations.</li>
        <li>No-key default setup with optional free dictionary enrichment.</li>
      </ul>
    </section>
  );
};

export default About;
