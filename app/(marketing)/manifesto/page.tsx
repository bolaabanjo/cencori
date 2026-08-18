import React from 'react';

export default function ManifestoPage() {
  return (
      <main className="container mx-auto py-32 px-6 max-w-2xl min-h-screen flex flex-col justify-center">
        <header className="mb-12 text-center sm:text-left">
          <h1 className="text-6xl sm:text-7xl font-serif italic font-normal tracking-tight">Manifesto</h1>
        </header>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground selection:bg-purple-500/30 max-w-lg">
          <p>
            Every technological era produces one infrastructure company that becomes its foundation. In the mainframe era, it was IBM. In the internet era, it was AWS. In the mobile era, it was Stripe. These companies did not simply participate in their eras. They defined the boundaries of what could be built within them.
          </p>

          <p>
            The AI era has arrived, and the computing beneath it is not ready. Not a wrapper. Not a framework. Not a tool for one part of the problem. The computing foundation that AI actually requires—the systems that let it execute, operate, control, and scale, wherever it runs—does not exist yet.
          </p>

          <p>
            Cencori is building it.
          </p>

          <p>
            Computing is not one layer. It is everything standing between a model and the world: the silicon that executes it, the systems that operate it, the controls that govern it, the networks that carry it. Whether the medium is neural networks, quantum computing, or a technology we cannot yet name, thinking systems will always require computing beneath them. We build that computing regardless of what powers intelligence in any given decade.
          </p>

          <p>
            We refuse to define AI by the constraints of a chat window. AI runs in the code of a financial agent processing billions in transactions, in the silicon of a drone navigating terrain it has never seen, in the mechatronics of a surgical robot making decisions measured in microseconds. The computing that powers these systems must span software, hardware, and everything between them. That is what we are building.
          </p>

          <p>
            Today, the computing that AI requires is scarce, uneven, and available mostly to those who can afford to build it themselves. Entire industries, institutions, and countries are locked out of running AI reliably—not for lack of ideas, but for lack of the foundation beneath them. This is a waste of human potential on a global scale. Our mission is to make the infrastructure required to build and run AI accessible to everyone, everywhere.
          </p>

          <p>
            We are building from Africa. Not because it is convenient, but because the next century of technology will not be written by one continent alone. Africa represents a billion people whose languages, economies, and industries will be shaped by intelligent systems. We believe the computing powering that transformation should be built by people who understand it from the inside, not imported as an afterthought.
          </p>

          <p>
            We do not build for the next funding round, the next model release, or the next hype cycle. We build for the long arc. Custom silicon. Globally distributed compute. Physical infrastructure that outlasts any single generation of software. The systems we are constructing today will power autonomous cities, transform medicine, and extend human capability in ways we are only beginning to imagine.
          </p>

          <p>
            The future belongs to those brave enough to build what the world needs before the world knows it needs it. AI needs computing. Cencori is the computing beneath every intelligent system that will ever be built.
          </p>

          <p className="pt-12 text-foreground font-bold italic font-serif text-2xl">
            Build Different.
          </p>
        </div>
      </main>
  );
}
