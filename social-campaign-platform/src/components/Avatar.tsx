import { useState } from "react";
import { UserRound } from "lucide-react";

interface AvatarProps {
  src?: string;
  name: string;
  className?: string;
  fallbackClassName?: string;
}

export default function Avatar({
  src,
  name,
  className = "h-10 w-10",
  fallbackClassName = "bg-gray-700 text-gray-300",
}: AvatarProps) {
  const [failedSource, setFailedSource] = useState<string | undefined>();
  const showImage = Boolean(src && src !== failedSource);

  if (showImage) {
    return (
      <img
        src={src}
        alt={`Profilbild von ${name}`}
        className={className}
        onError={() => setFailedSource(src)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={`Profilbild-Platzhalter für ${name}`}
      className={`inline-flex items-center justify-center ${className} ${fallbackClassName}`}
    >
      <UserRound className="h-1/2 w-1/2" aria-hidden="true" />
    </span>
  );
}
