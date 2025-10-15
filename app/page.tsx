import React from "react";

import { ContainerTextFlip } from "@/components/ui/container-text-flip";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";

const RootPage = () => {
  return (
    <>
      <Navbar/>
      <section className="h-full w-full overflow-x-hidden py-8">
      <div className="container border-b border-t border-dashed">
        <div className="relative flex w-full max-w-5xl flex-col justify-center border border-t-0 border-dashed px-5 py-12 md:items-center lg:mx-auto md:justify-center lg:mx-auto">
          <p className="text-muted-foreground flex items-center gap-2 gap-3 text-sm">
            <span className="inline-block size-2 rounded bg-green-500" />
            INTRODUCING CENCORI
          </p>
          <div className="mb-7 mt-3 w-full max-w-xl text-5xl font-medium font-semibold tracking-tighter md:mb-10 md:text-center md:text-6xl lg:relative lg:mb-0 lg:text-left lg:text-7xl">
            <h1 className="relative z-10 inline md:mr-3">
              The Easiest Way to <br className="block md:hidden" /> Build Intelligent{" "}
              <br className="block md:hidden" />
            </h1>
            <ContainerTextFlip
              className="absolute text-4xl font-medium font-semibold tracking-tighter md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:text-5xl lg:-bottom-4 lg:left-auto lg:translate-x-0 lg:text-7xl"
              words={["Deployments", "Models", "Integrations", "Infrastructure"]}
            />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-center border border-b-0 border-t-0 border-dashed py-20">
          <div className="w-full max-w-2xl space-y-5 md:text-center">
            <p className="text-muted-foreground px-5 lg:text-lg">
            A multi-tenant AI infrastructure platform designed to help teams build, deploy, and scale AI-driven applications with consistency and reliability.{" "}
            </p>
            <Button className="mx-5 h-12 rounded-lg">Get Started Now</Button>
          </div>
        </div>
        <ul className="md:h-34 mx-auto grid h-44 w-full max-w-5xl grid-cols-1 border border-b-0 border-dashed md:grid-cols-2 lg:h-24 lg:grid-cols-2">
          <li className="flex h-full items-center justify-between gap-10 px-5 md:gap-3 lg:justify-center">
            <p className="text-muted-foreground text-lg">
              10x Secured Deployment
            </p>
          </li>
          <li className="col-span-1 flex h-full items-center justify-between gap-10 border-l border-t border-dashed px-5 md:col-span-2 md:justify-center md:gap-3 lg:col-span-1 lg:border-t-0">
            <p className="text-muted-foreground text-lg">
              10x Faster Development
            </p>
          </li>
        </ul>
      </div>
    </section>
    </>
  );
};

export default RootPage;
