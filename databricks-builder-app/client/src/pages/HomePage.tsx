import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Loader2, MessageSquare, Plus, Clock, BarChart3, Folder, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useProjects } from '@/contexts/ProjectsContext';
import { useUser } from '@/contexts/UserContext';
import { formatRelativeTime } from '@/lib/utils';

type SortMode = 'recent' | 'conversations';

const CARD_MARKERS = [
  '#e24332',
  '#c66a15',
  '#a34863',
  '#6953a3',
  '#39708d',
  '#33806d',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getCardMarker(id: string) {
  return CARD_MARKERS[hashString(id) % CARD_MARKERS.length];
}

export default function HomePage() {
  const navigate = useNavigate();
  const { loading: userLoading } = useUser();
  const { projects, loading: projectsLoading, createProject, deleteProject, renameProject } = useProjects();
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const sortedProjects = useMemo(() => {
    const sorted = [...projects];
    if (sortMode === 'recent') {
      sorted.sort((a, b) => {
        if (!a.created_at) return 1;
        if (!b.created_at) return -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      sorted.sort((a, b) => b.conversation_count - a.conversation_count);
    }
    return sorted;
  }, [projects, sortMode]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    try {
      const project = await createProject(newProjectName.trim());
      setNewProjectName('');
      toast.success('Project created');
      navigate(`/projects/${project.id}`);
    } catch (error) {
      toast.error('Failed to create project');
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this project and all its conversations?')) return;

    try {
      await deleteProject(projectId);
      toast.success('Project deleted');
    } catch (error) {
      toast.error('Failed to delete project');
      console.error(error);
    }
  };

  const startRename = (e: React.MouseEvent, project: { id: string; name: string }) => {
    e.stopPropagation();
    setRenamingId(project.id);
    setRenameValue(project.name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const confirmRename = async (e?: React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!renamingId || !renameValue.trim()) return;

    try {
      await renameProject(renamingId, renameValue.trim());
      toast.success('Project renamed');
    } catch (error) {
      toast.error('Failed to rename project');
      console.error(error);
    }
    setRenamingId(null);
  };

  const cancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenamingId(null);
  };

  if (userLoading || projectsLoading) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-muted)]" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex-1 overflow-y-auto">
        <section className="relative border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                'radial-gradient(circle at 12% 0%, var(--workspace-glow), transparent 24rem), linear-gradient(90deg, var(--workspace-grid) 1px, transparent 1px)',
              backgroundSize: 'auto, 48px 48px',
            }}
          />
          <div className="relative mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:items-center lg:gap-14">
            <div className="max-w-2xl">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">
                  <svg className="h-6 w-6" viewBox="33 0 28 31" fill="none" aria-hidden="true">
                    <path
                      d="M59.7279 12.5153L47.2039 19.6185L33.8814 12.0502L33.251 12.3884V17.885L47.2039 25.8339L59.7279 18.7306V21.648L47.2039 28.7513L33.8814 21.1829L33.251 21.5212V22.4514L47.2039 30.4002L61.1989 22.4514V16.9548L60.5685 16.6165L47.2039 24.1849L34.7219 17.0816V14.2065L47.2039 21.2675L61.1989 13.3186V7.9066L60.4844 7.52607L47.2039 15.0521L35.3943 8.32941L47.2039 1.64897L56.9541 7.14554L57.8367 6.68044V6.00394L47.2039 0L33.251 7.9066V8.75223L47.2039 16.7011L59.7279 9.59785V12.5153Z"
                      fill="var(--color-accent-primary)"
                    />
                  </svg>
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                  Builder workspace
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text-heading)] sm:text-4xl">
                Build on Databricks
              </h1>
              <p className="mt-3 max-w-xl text-base leading-7 text-[var(--color-text-secondary)]">
                Create a project, work with the coding agent, and return to recent builds from one focused workspace.
              </p>
            </div>

            <form
              onSubmit={handleCreateProject}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-md)]"
            >
              <label
                htmlFor="new-project-name"
                className="block text-sm font-semibold text-[var(--color-text-heading)]"
              >
                Create a project
              </label>
              <p id="new-project-helper" className="mt-1 text-sm text-[var(--color-text-muted)]">
                Start a dedicated workspace for your next build.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Input
                  id="new-project-name"
                  aria-describedby="new-project-helper"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  disabled={isCreating}
                  className="h-10 flex-1"
                />
                <Button
                  type="submit"
                  disabled={!newProjectName.trim() || isCreating}
                  className="h-10 gap-2 px-4"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Creating
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Create project
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-11">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-text-heading)]">
              Recent projects
              <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                ({projects.length})
              </span>
            </h2>

            {projects.length > 1 && (
              <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-0.5">
                <button
                  type="button"
                  onClick={() => setSortMode('recent')}
                  aria-pressed={sortMode === 'recent'}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortMode === 'recent'
                      ? 'bg-[var(--color-background)] text-[var(--color-text-heading)] shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)]'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  Recent
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode('conversations')}
                  aria-pressed={sortMode === 'conversations'}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortMode === 'conversations'
                      ? 'bg-[var(--color-background)] text-[var(--color-text-heading)] shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)]'
                  }`}
                >
                  <BarChart3 className="h-3 w-3" />
                  Most Active
                </button>
              </div>
            )}
          </div>

          {projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-secondary)] px-6 py-14 text-center">
              <Folder className="mx-auto h-10 w-10 text-[var(--color-text-muted)] opacity-40" />
              <h3 className="mt-4 text-sm font-semibold text-[var(--color-text-heading)]">No projects yet</h3>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Name your first project above to open a new builder workspace.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedProjects.map((project) => {
                const marker = getCardMarker(project.id);
                const monogram = project.name.charAt(0).toUpperCase();
                const isRenaming = renamingId === project.id;

                return (
                  <article
                    key={project.id}
                    onClick={() => !isRenaming && navigate(`/projects/${project.id}`)}
                    className="group relative flex min-h-44 cursor-pointer flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)] focus-within:border-[var(--color-border-strong)] focus-within:shadow-[var(--shadow-md)]"
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ backgroundColor: marker }}
                    />

                    <div className="flex flex-1 flex-col p-5 pl-6">
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div
                          aria-hidden="true"
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-sm font-semibold text-[var(--color-text-heading)]"
                        >
                          {monogram}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => startRename(e, project)}
                            className="rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-heading)]"
                            aria-label={`Rename ${project.name}`}
                            title="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteProject(e, project.id)}
                            className="rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]"
                            aria-label={`Delete ${project.name}`}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {isRenaming ? (
                        <form
                          onSubmit={confirmRename}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Escape' && cancelRename()}
                            onBlur={(e) => {
                              if (!e.currentTarget.form?.contains(e.relatedTarget as Node | null)) {
                                void confirmRename();
                              }
                            }}
                            className="flex-1 min-w-0 text-lg font-semibold text-[var(--color-text-heading)] bg-transparent border-b-2 border-[var(--color-accent-primary)] outline-none py-0.5"
                            autoFocus
                            aria-label={`Rename ${project.name}`}
                          />
                          <button
                            type="submit"
                            className="rounded p-1 text-[var(--color-success)] hover:bg-[var(--color-success)]/10"
                            aria-label="Confirm rename"
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelRename}
                            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)]"
                            aria-label="Cancel rename"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </form>
                      ) : (
                        <h3>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/projects/${project.id}`);
                            }}
                            className="max-w-full truncate rounded-sm text-left text-base font-semibold leading-6 text-[var(--color-text-heading)] hover:underline"
                            title={`Open ${project.name}`}
                          >
                            {project.name}
                          </button>
                        </h3>
                      )}

                      <div className="min-h-5 flex-1" />

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>
                            {project.conversation_count} conversation{project.conversation_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <time
                          className="text-xs text-[var(--color-text-muted)]"
                          dateTime={project.created_at || undefined}
                        >
                          {project.created_at ? formatRelativeTime(project.created_at) : ''}
                        </time>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}
