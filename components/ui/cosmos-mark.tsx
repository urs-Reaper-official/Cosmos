type CosmosMarkProps = {
  className?: string;
  size?: number;
};

export function CosmosMark({ className, size = 26 }: CosmosMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="48" cy="48" r="37" stroke="currentColor" strokeWidth="3" opacity="0.34" />
      <path
        d="M65.5 28.5C60.8 24.9 55 23 48.5 23 34.4 23 23 34.4 23 48.5S34.4 74 48.5 74c6.5 0 12.3-1.9 17-5.5"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M48 34.5 51.8 44.7 62 48.5 51.8 52.3 48 62.5 44.2 52.3 34 48.5 44.2 44.7 48 34.5Z" fill="currentColor" />
      <circle cx="70" cy="29" r="4" fill="currentColor" />
    </svg>
  );
}
