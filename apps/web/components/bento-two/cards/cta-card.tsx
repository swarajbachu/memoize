import { Button } from "@/components/button";
import Image from "next/image";

export const CtaCard = () => {
  return (
    <div className="group flex h-full flex-col justify-end p-8">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-8 left-5 h-44 w-80 rotate-[-8deg] overflow-hidden rounded-2xl bg-white/[0.06] shadow-2xl shadow-black/40 transition duration-500 group-hover:rotate-[-4deg]">
          <Image
            src="/assets/product/memoize-sidebar.png"
            alt=""
            fill
            sizes="320px"
            className="object-cover"
          />
        </div>
        <div className="absolute top-20 right-[-2rem] h-44 w-96 rotate-[7deg] overflow-hidden rounded-2xl bg-white/[0.06] shadow-2xl shadow-black/40 transition duration-500 group-hover:rotate-[3deg]">
          <Image
            src="/assets/product/memoize-changes.png"
            alt=""
            fill
            sizes="384px"
            className="object-cover"
          />
        </div>
        <div className="absolute top-56 left-1/2 h-30 w-[34rem] -translate-x-1/2 overflow-hidden rounded-2xl bg-white/[0.06] shadow-2xl shadow-black/40 transition duration-500 group-hover:translate-y-[-6px]">
          <Image
            src="/assets/product/memoize-composer.png"
            alt=""
            fill
            sizes="544px"
            className="object-cover"
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-44 bg-linear-to-t from-card via-card/90 to-transparent" />
      </div>

      <div className="flex flex-col gap-5">
        <span className="-tracking-xs text-foreground text-lg leading-6 font-medium">
          Six agents, one workspace. Free public Alpha for macOS.
        </span>
        <div>
          <Button />
        </div>
      </div>
    </div>
  );
};
