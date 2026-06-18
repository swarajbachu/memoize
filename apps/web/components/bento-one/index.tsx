"use client";

import { cn } from "@/lib/utils";

import { Container } from "@/components/container";
import { Header } from "@/components/header";

import { DesignAndDevelopment } from "@/components/bento-one/cards/design-and-development";
import { RegularUpdates } from "@/components/bento-one/cards/regular-updates";
import { HostingDeploymentMaintenance } from "@/components/bento-one/cards/hosting-deployment-maintenance";
import { GetFoundOnGoogle } from "@/components/bento-one/cards/get-found-on-google";
import { ComponentsDashboardsAndEverything } from "@/components/bento-one/cards/components-dashboards-and-everything";

export const BentoOne = () => {
  return (
    <Container id="features" className="flex scroll-mt-24 flex-col gap-15 py-4">
      <Header>Every agent. One workspace.</Header>

      <div className="grid grid-cols-19 gap-3">
        <div className="bg-natural-black relative col-span-19 grid overflow-hidden rounded-2xl border border-white/10 p-4 lg:col-span-6">
          <DesignAndDevelopment />
        </div>
        <div
          className={cn(
            "col-span-19 grid grid-cols-1 gap-3 md:grid-cols-2 lg:col-span-13 lg:grid-cols-5",
            "[--box-min-height:314px]",
          )}
        >
          <div className="bg-card relative col-span-1 min-h-(--box-min-height) overflow-hidden rounded-2xl border border-white/10 p-4 pb-0 lg:col-span-2">
            <RegularUpdates />
          </div>
          <div className="bg-natural-black relative col-span-1 min-h-(--box-min-height) overflow-hidden rounded-2xl border border-white/10 lg:col-span-3">
            <HostingDeploymentMaintenance />
          </div>
          <div className="bg-card col-span-1 max-h-(--box-min-height) min-h-(--box-min-height) overflow-hidden rounded-2xl border border-white/10 p-4 lg:col-span-3">
            <GetFoundOnGoogle />
          </div>
          <div className="bg-card col-span-1 min-h-(--box-min-height) overflow-hidden rounded-2xl border border-white/10 lg:col-span-2">
            <ComponentsDashboardsAndEverything />
          </div>
        </div>
      </div>
    </Container>
  );
};
