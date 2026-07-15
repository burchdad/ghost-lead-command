import Image from "next/image";

type VegaAvatarProps = {
  caption?: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showStatus?: boolean;
};

const sizes = {
  xs: "w-10",
  sm: "w-16",
  md: "w-28",
  lg: "w-64 sm:w-80",
};

export default function VegaAvatar({
  caption = "Vega is online",
  className = "",
  size = "md",
  showStatus = true,
}: VegaAvatarProps) {
  return (
    <div className={`vega-float relative inline-flex flex-col items-center ${className}`}>
      <div className="vega-avatar-glow relative">
        <Image
          src="/vega-avatar.png"
          alt="Vega AI lead command avatar"
          width={640}
          height={960}
          className={`${sizes[size]} relative z-10 rounded-md object-contain drop-shadow-[0_0_30px_rgba(168,85,247,0.45)]`}
        />
        <span className="vega-scan absolute inset-x-8 bottom-8 top-8 z-20 rounded-full opacity-60" />
      </div>
      {showStatus ? (
        <div className="relative z-20 -mt-5 rounded-md border border-[#a855f7]/45 bg-[#090713]/85 px-3 py-2 text-center shadow-[0_0_24px_rgba(124,58,237,0.34)] backdrop-blur">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#c084fc]">{caption}</p>
        </div>
      ) : null}
    </div>
  );
}
