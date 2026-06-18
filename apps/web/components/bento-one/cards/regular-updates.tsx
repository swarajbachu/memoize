import { SquareDots } from "@/components/square-dots";
import { SkeletonTwo } from "@/components/bento-one/skeletons/second";

export const RegularUpdates = () => {
  return (
    <div className="h-full">
      <div className="absolute top-0 -right-20 size-40 w-full mask-b-from-10% mask-radial-[100%_100%] mask-radial-from-25% mask-radial-at-right opacity-10">
        <SquareDots color="#ffffff" className="absolute" />
      </div>
      <h2 className="text-base font-medium text-foreground">
        Review changes and <br />
        ship the PR
      </h2>
      <SkeletonTwo />
    </div>
  );
};

