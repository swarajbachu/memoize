import CardParalax from "~/components/card-reveal";
import HeroSection from "~/page/home/hero";

export default function Home() {
  return (
    <main>
      {/* <Component /> */}
      <HeroSection />
      <div className="w-[95vw] sm:w-[70vw]  aspect-video mx-auto rounded-md">
        <video
          id="how-it-works"
          src="https://d21j7ulj5s7ght.cloudfront.net/memoize-demo.mp4"
          autoPlay
          loop
          className="rounded-md border-4 border-opacity-40"
        >
          <track kind="captions" />
        </video>
      </div>
      <CardParalax />
      {/* <InteractiveGrayParticleMemoize /> */}
    </main>
  );
}
