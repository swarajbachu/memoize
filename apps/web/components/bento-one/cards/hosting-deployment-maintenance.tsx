import { SkeletonThree } from "@/components/bento-one/skeletons/three";

export const HostingDeploymentMaintenance = () => {
  return (
    <div className="relative h-full">
      <svg
        className="absolute -top-20 -left-80 z-40 rotate-45 fill-white/80 blur-3xl"
        width="100%"
        height="100%"
      >
        <ellipse cx="50%" cy="50%" rx="100" ry="60" />
      </svg>
      <h2 className="relative z-50 p-4 text-base font-medium text-white">
        Switch providers without leaving the app
      </h2>
      <SkeletonThree />
    </div>
  );
};

