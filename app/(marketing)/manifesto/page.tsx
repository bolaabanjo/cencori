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
            The intelligence era has arrived, and it does not yet have its infrastructure. Not a wrapper. Not a framework. Not a tool for one part of the problem. The complete foundation—from the silicon that runs computation to the economic layer that turns intelligence into sustainable business—does not exist yet.
          </p>

          <p>
            Cencori is building it.
          </p>

          <p>
            Intelligence is not artificial intelligence. Intelligence is the capacity of a system to perceive, reason, decide, and act. Whether the medium is neural networks, quantum computing, or a technology we cannot yet name, thinking systems will always require a foundation beneath them. We build that foundation regardless of which technology powers intelligence in any given decade.
          </p>

          <p>
            We refuse to define intelligence by the constraints of a chat window. Intelligence lives in the code of a financial agent processing billions in transactions, in the silicon of a drone navigating terrain it has never seen, in the mechatronics of a surgical robot making decisions measured in microseconds. The infrastructure that powers these systems must span software, hardware, and everything between them. That is what we are building.
          </p>

          <p>
            Today, building an intelligent product is needlessly broken. Before writing a single line of product code, teams spend months solving infrastructure problems that have nothing to do with their actual vision—routing, security, memory, billing, deployment. This is a waste of human potential on a global scale. Cencori exists to collapse that complexity into a single foundation, moving teams from idea to production in minutes rather than months.
          </p>

          <p>
            We are building from Africa. Not because it is convenient, but because the next century of technology will not be written by one continent alone. Africa represents a billion people whose languages, economies, and industries will be shaped by intelligent systems. We believe the infrastructure powering that transformation should be built by people who understand it from the inside, not imported as an afterthought.
          </p>

          <p>
            We do not build for the next funding round, the next model release, or the next hype cycle. We build for the long arc. Custom silicon. Globally distributed compute. Physical infrastructure that outlasts any single generation of software. The systems we are constructing today will power autonomous cities, transform medicine, and extend human capability in ways we are only beginning to imagine.
          </p>

          <p>
            The future belongs to those brave enough to build what the world needs before the world knows it needs it. Cencori is the foundation for every intelligent system that will ever be built.
          </p>

          <p className="pt-12 text-foreground font-bold italic font-serif text-2xl">
            Build Different.
          </p>
        </div>
      </main>
  );
}
