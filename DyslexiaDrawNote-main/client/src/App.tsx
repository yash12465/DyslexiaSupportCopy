import { useEffect, useState } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Home from "@/pages/Home";
import Note from "@/pages/Note";
import Training from "@/pages/Training";
import AnalyzeText from "@/pages/AnalyzeText";
import Tools from "@/pages/Tools";
import About from "@/pages/About";
import AIAssistant from "@/pages/AIAssistant";
import NotFound from "@/pages/not-found";

function Router() {
  const [highContrast, setHighContrast] = useState(false);
  const [dyslexicFont, setDyslexicFont] = useState(true);
  const [readableSpacing, setReadableSpacing] = useState(true);

  useEffect(() => {
    document.body.classList.toggle("high-contrast", highContrast);
    document.body.classList.toggle("font-dyslexic-enabled", dyslexicFont);
    document.body.classList.toggle("readable-spacing", readableSpacing);
  }, [highContrast, dyslexicFont, readableSpacing]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header
        highContrast={highContrast}
        dyslexicFont={dyslexicFont}
        readableSpacing={readableSpacing}
        onToggleHighContrast={setHighContrast}
        onToggleDyslexicFont={setDyslexicFont}
        onToggleReadableSpacing={setReadableSpacing}
      />
      <main className="container mx-auto px-4 py-6">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/analyze" component={AnalyzeText} />
          <Route path="/ai" component={AIAssistant} />
          <Route path="/tools" component={Tools} />
          <Route path="/about" component={About} />
          <Route path="/note/:id?" component={Note} />
          <Route path="/training" component={Training} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
