"use client";

import type { Agent } from "@/types";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AgentCardProps {
  agent: Agent;
  onStart: () => void;
}

export function AgentCard({ agent, onStart }: AgentCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{agent.icon}</span>
          <div>
            <h3 className="font-semibold text-lg">{agent.name}</h3>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3 flex-1">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {agent.description}
        </p>
      </CardContent>
      <CardFooter className="mt-auto">
        <Button onClick={onStart} className="w-full">
          开始对话
        </Button>
      </CardFooter>
    </Card>
  );
}
