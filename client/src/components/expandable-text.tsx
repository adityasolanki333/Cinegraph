import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExpandableTextProps {
  text: string;
  maxLines?: number;
  className?: string;
}

export function ExpandableText({ text, maxLines = 3, className = "" }: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const checkIfClamped = () => {
      if (textRef.current) {
        setIsClamped(textRef.current.scrollHeight > textRef.current.clientHeight);
      }
    };

    // Use requestAnimationFrame to ensure DOM has finished rendering
    requestAnimationFrame(() => {
      checkIfClamped();
    });
    
    // Recheck on window resize
    window.addEventListener('resize', checkIfClamped);
    return () => window.removeEventListener('resize', checkIfClamped);
  }, [text]);

  // Map maxLines to explicit Tailwind classes for static detection
  const lineClampClasses: Record<number, string> = {
    1: 'line-clamp-1',
    2: 'line-clamp-2',
    3: 'line-clamp-3',
    4: 'line-clamp-4',
    5: 'line-clamp-5',
    6: 'line-clamp-6',
  };

  const lineClampClass = lineClampClasses[maxLines] || 'line-clamp-3';

  return (
    <div className="space-y-2">
      <p 
        ref={textRef}
        className={`${className} ${!isExpanded ? lineClampClass : ''}`}
        data-testid="text-overview"
      >
        {text}
      </p>
      {isClamped && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm font-medium hover:bg-transparent p-0 h-auto"
          data-testid={isExpanded ? "button-read-less" : "button-read-more"}
        >
          {isExpanded ? (
            <>
              <span>Read Less</span>
              <ChevronUp className="h-4 w-4 ml-1" />
            </>
          ) : (
            <>
              <span>Read More</span>
              <ChevronDown className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      )}
    </div>
  );
}
