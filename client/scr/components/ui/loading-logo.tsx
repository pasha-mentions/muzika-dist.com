export function LoadingLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="animate-pulse">
        <img 
          src="/attached_assets/Logo_07 копія_1759693540675.png" 
          alt="Loading" 
          className="w-16 h-16"
          style={{
            animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }}
        />
      </div>
    </div>
  );
}
