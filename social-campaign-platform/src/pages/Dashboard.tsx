import {
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  MessageSquare,
  Target,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { format, isAfter, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { useAppData } from "../contexts/app-data";
import { useAuth } from "../contexts/auth";
import type { TaskStatus } from "../types";

const statusLabels: Record<TaskStatus, string> = {
  planned: "Geplant",
  in_progress: "In Arbeit",
  blocker: "Blockiert",
  finished: "Erledigt",
};
const statusColors: Record<TaskStatus, string> = {
  planned: "text-blue-400",
  in_progress: "text-yellow-400",
  blocker: "text-red-400",
  finished: "text-green-400",
};

export default function Dashboard() {
  const { user } = useAuth();
  const {
    campaigns,
    workPackages,
    socialMediaPosts,
    socialMediaAccounts,
    settings,
  } = useAppData();
  const openTasks = workPackages.filter((task) => task.status !== "finished");
  const activeCampaigns = campaigns.filter(
    (campaign) => campaign.status === "active",
  );
  const visibleAccountIds = new Set(
    settings.socialSyncEnabled
      ? socialMediaAccounts
          .filter(
            (account) =>
              account.isActive && account.connectionStatus === "connected",
          )
          .map((account) => account.id)
      : [],
  );
  const visibleSocialPosts = socialMediaPosts.filter((post) =>
    visibleAccountIds.has(post.accountId),
  );
  const totalInteractions = visibleSocialPosts.reduce(
    (sum, post) =>
      sum + (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0),
    0,
  );
  const averageEngagement =
    visibleSocialPosts.length === 0
      ? 0
      : visibleSocialPosts.reduce(
          (sum, post) => sum + (post.engagement ?? 0),
          0,
        ) / visibleSocialPosts.length;
  const today = startOfDay(new Date());
  const upcomingTasks = openTasks
    .filter((task) => task.dueDate && isAfter(task.dueDate, today))
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
    .slice(0, 5);
  const attentionTasks =
    upcomingTasks.length > 0
      ? upcomingTasks
      : openTasks
          .slice()
          .sort(
            (a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0),
          )
          .slice(0, 5);
  const recentPosts = visibleSocialPosts
    .slice()
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
    .slice(0, 3);
  const currentCampaigns = campaigns
    .filter((campaign) => campaign.status !== "archived")
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 3);
  const tasksByStatus = (
    ["in_progress", "planned", "blocker", "finished"] as TaskStatus[]
  ).map((status) => ({
    status,
    count: workPackages.filter((task) => task.status === status).length,
  }));

  const statCards = [
    {
      title: "Aktive Kampagnen",
      value: activeCampaigns.length,
      detail: `/ ${campaigns.filter((campaign) => campaign.status !== "archived").length}`,
      icon: Target,
      to: "/campaigns",
      className: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    },
    {
      title: "Offene Aufgaben",
      value: openTasks.length,
      detail: "",
      icon: CheckCircle,
      to: "/tasks",
      className: "border-green-500/20 bg-green-500/10 text-green-400",
    },
    {
      title: "Social Posts",
      value: visibleSocialPosts.length,
      detail: "",
      icon: MessageSquare,
      to: "/social-stream",
      className: "border-purple-500/20 bg-purple-500/10 text-purple-400",
    },
    {
      title: "Ø Engagement",
      value: `${averageEngagement.toFixed(1)}%`,
      detail: `${totalInteractions.toLocaleString("de-DE")} Interaktionen`,
      icon: TrendingUp,
      to: "/social-stream",
      className: "border-red-500/20 bg-red-500/10 text-red-400",
    },
  ];

  return (
    <div className="p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-white">
            Willkommen zurück, {user?.name}!
          </h1>
          <p className="text-gray-400">
            Hier ist der aktuelle Überblick über deine Kampagnen und Aufgaben.
          </p>
        </div>
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Link
                key={stat.title}
                to={stat.to}
                className={`rounded-xl border p-6 transition-transform hover:-translate-y-0.5 ${stat.className}`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <Icon className="h-8 w-8" />
                  <ArrowRight className="h-5 w-5 text-gray-400" />
                </div>
                <div className="text-3xl font-bold text-white">
                  {stat.value}
                  <span className="ml-1 text-lg text-gray-400">
                    {stat.detail.startsWith("/") ? stat.detail : ""}
                  </span>
                </div>
                <p className="mt-1 text-gray-400">{stat.title}</p>
                {stat.detail && !stat.detail.startsWith("/") && (
                  <p className="mt-1 text-xs text-gray-500">{stat.detail}</p>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
            <h2 className="mb-6 flex items-center text-xl font-semibold text-white">
              <CheckCircle className="mr-2 h-5 w-5 text-blue-400" />
              Aufgabenstatus
            </h2>
            <div className="space-y-2">
              {tasksByStatus.map(({ status, count }) => (
                <Link
                  to={`/tasks?status=${status}`}
                  key={status}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 hover:bg-gray-700/60"
                >
                  <span className="flex items-center text-gray-300">
                    <span
                      className={`mr-3 h-3 w-3 rounded-full ${statusColors[status].replace("text-", "bg-")}`}
                    />
                    {statusLabels[status]}
                  </span>
                  <span
                    className={`text-lg font-semibold ${statusColors[status]}`}
                  >
                    {count}
                  </span>
                </Link>
              ))}
            </div>
            <Link
              to="/tasks"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300"
            >
              Alle Aufgaben ansehen →
            </Link>
          </section>
          <section className="rounded-xl border border-gray-700 bg-gray-800/50 p-6 lg:col-span-2">
            <h2 className="mb-6 flex items-center text-xl font-semibold text-white">
              <Clock className="mr-2 h-5 w-5 text-yellow-400" />
              {upcomingTasks.length > 0
                ? "Anstehende Deadlines"
                : "Offene Aufgaben"}
            </h2>
            <div className="space-y-3">
              {attentionTasks.map((task) => (
                <Link
                  to="/tasks"
                  key={task.id}
                  className="flex flex-col gap-3 rounded-lg bg-gray-800 p-3 hover:bg-gray-700 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-white">{task.title}</h3>
                    <p className="truncate text-sm text-gray-400">
                      {task.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`rounded px-2 py-1 text-xs ${task.priority === "critical" ? "bg-red-500/20 text-red-300" : task.priority === "high" ? "bg-orange-500/20 text-orange-300" : "bg-yellow-500/20 text-yellow-300"}`}
                    >
                      {task.priority}
                    </span>
                    {task.dueDate && (
                      <span className="text-sm text-gray-400">
                        {format(task.dueDate, "dd.MM.yyyy", { locale: de })}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {attentionTasks.length === 0 && (
                <p className="py-8 text-center text-gray-500">
                  Alle Aufgaben sind erledigt.
                </p>
              )}
            </div>
            <Link
              to="/tasks"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300"
            >
              Zur Aufgabenplanung →
            </Link>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
            <h2 className="mb-6 flex items-center text-xl font-semibold text-white">
              <Target className="mr-2 h-5 w-5 text-green-400" />
              Aktuelle Kampagnen
            </h2>
            <div className="space-y-4">
              {currentCampaigns.map((campaign) => (
                <Link
                  to={`/campaigns/${campaign.id}`}
                  key={campaign.id}
                  className="block rounded-lg bg-gray-800 p-4 hover:bg-gray-700"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-white">
                      {campaign.name}
                    </h3>
                    <span
                      className={`rounded px-2 py-1 text-xs ${campaign.status === "active" ? "bg-green-500/20 text-green-300" : "bg-blue-500/20 text-blue-300"}`}
                    >
                      {campaign.status}
                    </span>
                  </div>
                  <p className="mb-3 line-clamp-2 text-sm text-gray-400">
                    {campaign.description}
                  </p>
                  <div className="flex items-center text-xs text-gray-500">
                    <Calendar className="mr-1 h-3 w-3" />
                    {format(campaign.startDate, "dd.MM.yyyy")} –{" "}
                    {format(campaign.endDate, "dd.MM.yyyy")}
                  </div>
                </Link>
              ))}
              {currentCampaigns.length === 0 && (
                <p className="rounded-lg border border-dashed border-gray-700 py-8 text-center text-gray-400">
                  Noch keine laufenden Kampagnen.
                </p>
              )}
            </div>
            <Link
              to="/campaigns"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300"
            >
              Alle Kampagnen anzeigen →
            </Link>
          </section>
          <section className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
            <h2 className="mb-6 flex items-center text-xl font-semibold text-white">
              <TrendingUp className="mr-2 h-5 w-5 text-purple-400" />
              Letzte Social Posts
            </h2>
            <div className="space-y-4">
              {recentPosts.map((post) => (
                <Link
                  to="/social-stream"
                  key={post.id}
                  className="block rounded-lg bg-gray-800 p-4 hover:bg-gray-700"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-blue-400">
                      {post.platform}
                    </span>
                    <span className="text-xs text-gray-500">
                      {format(post.postedAt, "dd.MM.yyyy HH:mm")}
                    </span>
                  </div>
                  <p className="mb-3 line-clamp-2 text-sm text-gray-300">
                    {post.content}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>♥ {post.likes?.toLocaleString("de-DE") ?? 0}</span>
                    <span>● {post.comments?.toLocaleString("de-DE") ?? 0}</span>
                    <span>↗ {post.shares?.toLocaleString("de-DE") ?? 0}</span>
                  </div>
                </Link>
              ))}
              {recentPosts.length === 0 && (
                <p className="rounded-lg border border-dashed border-gray-700 py-8 text-center text-gray-400">
                  Noch keine Social Posts verfügbar.
                </p>
              )}
            </div>
            <Link
              to="/social-stream"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300"
            >
              Zum Social Stream →
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
