import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  testIdPrefix: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  testIdPrefix
}: PaginationProps) {
  const [pageInput, setPageInput] = useState(currentPage.toString());

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  if (totalPages <= 1) return null;

  const handlePageJump = () => {
    const pageNum = parseInt(pageInput);
    if (pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handlePageJump();
    }
  };

  const renderPageNumbers = () => {
    const pageNumbers = [];
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(
          <Button
            key={i}
            variant={currentPage === i ? "default" : "outline"}
            size="sm"
            onClick={() => onPageChange(i)}
            data-testid={`${testIdPrefix}-page-${i}`}
          >
            {i}
          </Button>
        );
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) {
          pageNumbers.push(
            <Button
              key={i}
              variant={currentPage === i ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(i)}
              data-testid={`${testIdPrefix}-page-${i}`}
            >
              {i}
            </Button>
          );
        }
        pageNumbers.push(<span key="ellipsis" className="px-2">...</span>);
      } else if (currentPage >= totalPages - 2) {
        pageNumbers.push(<span key="ellipsis" className="px-2">...</span>);
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pageNumbers.push(
            <Button
              key={i}
              variant={currentPage === i ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(i)}
              data-testid={`${testIdPrefix}-page-${i}`}
            >
              {i}
            </Button>
          );
        }
      } else {
        pageNumbers.push(<span key="ellipsis1" className="px-2">...</span>);
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pageNumbers.push(
            <Button
              key={i}
              variant={currentPage === i ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(i)}
              data-testid={`${testIdPrefix}-page-${i}`}
            >
              {i}
            </Button>
          );
        }
        pageNumbers.push(<span key="ellipsis2" className="px-2">...</span>);
      }
    }
    
    return pageNumbers;
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 mt-8">
      <div className="text-sm text-muted-foreground font-medium">
        Page {currentPage} of {totalPages}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          data-testid={`${testIdPrefix}-first`}
          className="hidden sm:flex"
        >
          First
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          data-testid={`${testIdPrefix}-prev`}
        >
          Previous
        </Button>
        
        <div className="flex items-center gap-1 sm:gap-2">
          {renderPageNumbers()}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          data-testid={`${testIdPrefix}-next`}
        >
          Next
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          data-testid={`${testIdPrefix}-last`}
          className="hidden sm:flex"
        >
          Last
        </Button>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Jump to page:</span>
        <Input
          type="number"
          min="1"
          max={totalPages}
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyPress={handleKeyPress}
          className="w-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          data-testid={`${testIdPrefix}-input`}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handlePageJump}
          data-testid={`${testIdPrefix}-go`}
        >
          Go
        </Button>
      </div>
    </div>
  );
}
