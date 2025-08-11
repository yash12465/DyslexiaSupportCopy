import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { PlusCircle, ArrowLeft, Brain } from "lucide-react";

const Header = () => {
  const [location, navigate] = useLocation();
  const isNoteView = location.startsWith('/note');
  const isTrainingView = location.startsWith('/training');

  return (
    <header className="bg-white shadow-md py-4 px-6 mb-6">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center">
          <Link href="/">
            <h1 className="text-3xl font-bold text-primary font-dyslexic cursor-pointer">
              DyslexiNote
            </h1>
          </Link>
        </div>
        <nav className="hidden md:flex space-x-6 items-center mr-4">
          <div className={`text-lg ${location === '/' ? 'font-bold text-primary' : 'text-gray-600 hover:text-primary'}`}>
            <Link href="/">Home</Link>
          </div>
          <div className={`text-lg ${location === '/training' ? 'font-bold text-primary' : 'text-gray-600 hover:text-primary'}`}>
            <Link href="/training">OCR Training</Link>
          </div>
        </nav>
        <div className="flex items-center space-x-4">
          {isNoteView ? (
            <Button
              onClick={() => navigate('/')}
              className="font-dyslexic text-lg font-semibold"
            >
              <ArrowLeft className="mr-2 h-5 w-5" /> Back to Home
            </Button>
          ) : isTrainingView ? (
            <Button
              onClick={() => navigate('/')}
              className="font-dyslexic text-lg font-semibold"
            >
              <ArrowLeft className="mr-2 h-5 w-5" /> Back to Home
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/note')}
              className="font-dyslexic text-lg font-semibold"
            >
              <PlusCircle className="mr-2 h-5 w-5" /> New Note
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
