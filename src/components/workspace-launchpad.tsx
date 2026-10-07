import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  FileText,
  LayoutGrid,
  Plus,
  Receipt,
  Search,
  X,
} from "lucide-react";
import type { Snapshot } from "@/lib/client";
import type { Draft } from "@/kernel/application";
import type { BuilderPlan } from "@/kernel/builder-plan";
import { Button } from "./ui/button";
import { Alert, Badge, Empty } from "./ui/surfaces";
import { cn } from "@/lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";

type Props = {
  projects: Snapshot["projects"];
  drafts: Draft[];
  plans: BuilderPlan[];
  owner: boolean;
  loaded: boolean;
  failed: boolean;
  busy: string;
  onCreate: () => void;
  onPlan: (plan: BuilderPlan) => void;
  onDraft: (draft: Draft) => void;
  onInstallDemo: () => void;
  onRemoveDemo: () => void;
  onRetry: () => void;
};

export function WorkspaceLaunchpad({
  projects,
  drafts,
  plans,
  owner,
  loaded,
  failed,
  busy,
  onCreate,
  onPlan,
  onDraft,
  onInstallDemo,
  onRemoveDemo,
  onRetry,
}: Props) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const search = query.trim().toLowerCase();
  function clearSearch() {
    setQuery("");
    searchRef.current?.focus();
  }
  const demo = projects.find((project) => project.demo);
  const applications = projects.filter((project) => !project.demo);
  const filtered = applications.filter((project) =>
    `${project.name} ${project.description}`
      .toLowerCase()
      .includes(search),
  );
  const demoVisible =
    demo &&
    `${demo.name} ${demo.description} purchasing demo`
      .toLowerCase()
      .includes(search);
  return (
    <div className="workspace-launchpad">
      <section
        aria-labelledby="launch-apps-title"
        className="launch-applications"
      >
        <div className="launch-section-header">
          <div>
            <h2 id="launch-apps-title">
              Your applications <Badge>{applications.length}</Badge>
            </h2>
            <p>One place for the tools your team runs on.</p>
          </div>
          {projects.length > 1 ? (
            <InputGroup className="launch-search">
              <InputGroupInput
                ref={searchRef}
                type="search"
                aria-describedby="launch-search-status"
                aria-label="Find an application"
                placeholder="Find an application…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              {query ? (
                <InputGroupAddon align="inline-end">
                  <Button
                    variant="ghost"
                    aria-label="Clear application search"
                    onPress={clearSearch}
                  >
                    <X data-icon="inline-start" aria-hidden="true" />
                  </Button>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          ) : (
            <Link className="launch-text-link" to="/applications">
              View applications <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          )}
        </div>
        <p className="sr-only" role="status" id="launch-search-status">
          {search
            ? `${filtered.length + (demoVisible ? 1 : 0)} applications found.`
            : ""}
        </p>
        {filtered.length ? (
          <ul className="launch-app-list">
            {filtered.map((project) => (
              <li key={project.slug}>
                <Link
                  className="launch-app"
                  to="/p/$projectSlug"
                  params={{ projectSlug: project.slug }}
                >
                  <span className="launch-app-icon">
                    <LayoutGrid aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{project.name}</h3>
                    <p>
                      {project.description || "Open your application workspace."}
                    </p>
                  </div>
                  <span className="launch-app-meta">
                    Published · Version {project.version}
                  </span>
                  <ArrowRight className="launch-open-arrow" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {demoVisible ? (
          <article
            className={cn("launch-demo", applications.length > 0 && "launch-demo-compact")}
          >
            <div className="launch-demo-copy">
              <span className="launch-demo-icon">
                <Receipt aria-hidden="true" />
              </span>
              <div>
                <div className="launch-demo-title">
                  <h3>Purchasing</h3>
                  <Badge variant="warning">Sample application</Badge>
                </div>
                <p>Try the purchasing demo</p>
                <p className="launch-demo-description">
                  Sample requests are waiting for a decision. Open the queue,
                  stage an action, then create your own application when you are
                  ready.
                </p>
                <div className="launch-demo-actions">
                  <Link
                    className={cn("button", applications.length ? "button-outline" : "button-primary")}
                    to="/p/$projectSlug"
                    params={{ projectSlug: demo.slug }}
                  >
                    Open purchasing demo <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  </Link>
                  {owner ? (
                    <Button
                      variant="ghost"
                      disabled={Boolean(busy)}
                      onPress={onRemoveDemo}
                    >
                      Remove demo
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            {!applications.length ? (
              <div
                className="launch-demo-flow"
                aria-label="Purchasing demo workflow"
              >
                <span>
                  <FileText aria-hidden="true" />
                  Request
                </span>
                <i />
                <span>
                  <Search aria-hidden="true" />
                  Review
                </span>
                <i />
                <span>
                  <Receipt aria-hidden="true" />
                  Decision
                </span>
                <p>Explore the workflow with sample records.</p>
              </div>
            ) : null}
          </article>
        ) : null}
        {search && !filtered.length && !demoVisible ? (
          <div className="launch-empty">
            <Empty title={`No applications match “${query.trim()}”`}>
              <p>Try another name or clear your search.</p>
              <Button variant="outline" onPress={clearSearch}>
                Clear search
              </Button>
            </Empty>
          </div>
        ) : null}
        {!projects.length && !search ? (
          <div className="launch-empty launch-first">
            <Empty title="Your first business application starts here">
              <p>
                Assemble catalog modules, describe a process, or install the
                purchasing demo to try queues and review with sample records.
              </p>
              {owner ? (
                <Button
                  variant="outline"
                  disabled={Boolean(busy)}
                  onPress={onInstallDemo}
                >
                  {busy || "Install purchasing demo"}
                </Button>
              ) : (
                <p>Ask your workspace owner to add an application.</p>
              )}
            </Empty>
          </div>
        ) : null}
      </section>
      <div className="launch-lower">
        <section aria-labelledby="launch-work-title">
          <div className="launch-section-header">
            <div>
              <h2 id="launch-work-title">Continue your work</h2>
              <p>Pick up a plan or draft right where you left it.</p>
            </div>
          </div>
          {!owner ? (
            <div className="launch-work-empty">
              <FileText aria-hidden="true" />
              <div>
                <h3>Plans and drafts are managed by your owner</h3>
                <p>Your available applications are listed above.</p>
              </div>
            </div>
          ) : failed ? (
            <div className="launch-work-error">
              <Alert variant="danger">Saved work could not be loaded.</Alert>
              <Button variant="outline" onPress={onRetry}>
                Try again
              </Button>
            </div>
          ) : !loaded ? (
            <p className="launch-work-status" role="status">Loading saved work…</p>
          ) : plans.length || drafts.length ? (
            <div className="launch-work-list">
              {plans.map((plan) => (
                <div className="launch-work-row" key={plan.id}>
                  <FileText aria-hidden="true" />
                  <div>
                    <h3>
                      {plan.content.proposal?.plan.name ||
                        plan.content.request.slice(0, 80)}
                    </h3>
                    <p>
                      Saved plan ·{" "}
                      {plan.status === "confirmed"
                        ? "Ready to build"
                        : "In progress"}
                    </p>
                  </div>
                  <Button variant="ghost" onPress={() => onPlan(plan)}>
                    Open plan <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {drafts.map((draft) => (
                <div className="launch-work-row" key={draft.id}>
                  <Boxes aria-hidden="true" />
                  <div>
                    <h3>{draft.definition.name}</h3>
                    <p>
                      {draft.baseProjectVersion
                        ? `Application v${draft.baseProjectVersion} changes`
                        : "Draft"}{" "}
                      · Revision {draft.version}
                    </p>
                  </div>
                  <Button variant="ghost" onPress={() => onDraft(draft)}>
                    Open draft <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="launch-work-empty">
              <FileText aria-hidden="true" />
              <div>
                <h3>A place for work in progress</h3>
                <p>Your saved plans and drafts will appear here.</p>
                {owner ? (
                  <Button variant="ghost" onPress={onCreate}>
                    Start an application <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </section>
        <aside className="launch-catalog">
          <Boxes aria-hidden="true" />
          <h2>Start with the building blocks</h2>
          <p>
            Explore the catalog to find the modules for your next application.
          </p>
          <Link className="launch-text-link" to="/catalog">
            Explore catalog <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
          <div className="launch-catalog-note">
            <Plus aria-hidden="true" />
            Assemble around the way you work.
          </div>
        </aside>
      </div>
    </div>
  );
}
