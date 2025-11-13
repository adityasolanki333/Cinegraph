import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe } from "lucide-react";

interface Trailer {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  iso_639_1?: string;
}

interface TrailerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  trailerKey?: string;
  trailers?: Trailer[];
  title: string;
  originalLanguage?: string;
}

const languageNames: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
};

// Allowed language codes for trailer filtering
const ALLOWED_LANGUAGES = ['en', 'hi', 'ta', 'te', 'ml', 'kn'];

export function TrailerDialog({ isOpen, onClose, trailerKey, trailers, title, originalLanguage }: TrailerDialogProps) {
  // Indian languages where TMDB often mislabels trailers as English
  const INDIAN_LANGUAGES = ['hi', 'ta', 'te', 'ml', 'kn', 'bn'];
  
  // Use the trailers array if provided, otherwise fall back to single trailer
  // Filter to only show trailers in allowed languages (if present)
  const availableTrailers = useMemo(() => {
    const allTrailers = trailers || (trailerKey ? [{ id: "default", key: trailerKey, name: title, site: "YouTube", type: "Trailer" }] : []);
    
    // For Indian language movies, show ALL trailers since TMDB often mislabels them
    if (originalLanguage && INDIAN_LANGUAGES.includes(originalLanguage)) {
      return allTrailers;
    }
    
    // For other movies, filter trailers to only include allowed languages
    const filtered = allTrailers.filter(trailer => {
      const lang = trailer.iso_639_1 || "en";
      return ALLOWED_LANGUAGES.includes(lang);
    });
    
    // If no trailers match the allowed languages, fall back to showing all trailers
    return filtered.length > 0 ? filtered : allTrailers;
  }, [trailers, trailerKey, title, originalLanguage]);
  
  const [selectedTrailer, setSelectedTrailer] = useState<string>("");

  // Update selected trailer when props change (new movie/show opened)
  useEffect(() => {
    // For Indian movies, prioritize trailers in the original language, then Hindi
    const isIndianMovie = originalLanguage && INDIAN_LANGUAGES.includes(originalLanguage);
    
    let priorityTrailer;
    if (isIndianMovie) {
      // Try original language first, then Hindi
      priorityTrailer = availableTrailers.find(t => t.iso_639_1 === originalLanguage) ||
                       availableTrailers.find(t => t.iso_639_1 === 'hi');
    } else {
      // For non-Indian movies, prioritize Hindi
      priorityTrailer = availableTrailers.find(t => t.iso_639_1 === 'hi');
    }
    
    // Only use trailerKey if it exists in the filtered availableTrailers
    const trailerKeyExists = trailerKey && availableTrailers.some(t => t.key === trailerKey);
    
    // Priority: language-based trailer > trailerKey > first available
    const defaultKey = priorityTrailer?.key || 
                      (trailerKeyExists ? trailerKey : (availableTrailers.length > 0 ? availableTrailers[0]?.key : ""));
    setSelectedTrailer(defaultKey || "");
  }, [trailerKey, trailers, availableTrailers, originalLanguage, INDIAN_LANGUAGES]);
  
  // Group trailers by language
  const trailersByLanguage = availableTrailers.reduce((acc, trailer) => {
    const lang = trailer.iso_639_1 || "en";
    if (!acc[lang]) {
      acc[lang] = [];
    }
    acc[lang].push(trailer);
    return acc;
  }, {} as Record<string, Trailer[]>);

  // Don't render iframe if no trailer is selected
  if (!selectedTrailer && isOpen) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl p-6">
          <DialogHeader>
            <DialogTitle>{title} - No Trailer Available</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center text-muted-foreground">
            <p>Sorry, no trailer is currently available for this title.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl p-0">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle>{title} - Trailer</DialogTitle>
            <Select value={selectedTrailer} onValueChange={setSelectedTrailer}>
              <SelectTrigger className="w-[180px]" data-testid="select-trailer-language">
                <Globe className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(trailersByLanguage).map(([lang, langTrailers]) => 
                  langTrailers.map((trailer, index) => (
                    <SelectItem key={trailer.key} value={trailer.key}>
                      {trailer.name || `${languageNames[lang] || lang.toUpperCase()}${langTrailers.length > 1 ? ` ${index + 1}` : ''}`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogDescription className="sr-only">
            Watch the official trailer for {title}
          </DialogDescription>
        </DialogHeader>
        <div className="relative pb-[56.25%] h-0">
          <iframe
            key={selectedTrailer}
            className="absolute top-0 left-0 w-full h-full"
            src={`https://www.youtube.com/embed/${selectedTrailer}?autoplay=1`}
            title={`${title} Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            data-testid="trailer-iframe"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
