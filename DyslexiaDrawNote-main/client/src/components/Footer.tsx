import { Link } from "wouter";

const Footer = () => {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-white">
      <div className="container mx-auto flex flex-col gap-3 px-4 py-5 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} DyslexiaSupportCopy · Accessible reading and writing support.</p>
        <div className="flex gap-4">
          <Link href="/analyze" className="hover:text-blue-600">Analyze</Link>
          <Link href="/tools" className="hover:text-blue-600">Tools</Link>
          <Link href="/about" className="hover:text-blue-600">About</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
