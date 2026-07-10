
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Comment, Post } from '../types';

interface CommentTreeProps {
  comments: Comment[];
  rootPost: Post;
  activeCommentId?: string | null;
  onNodeClick?: (commentId: string) => void;
}

export const CommentTree = ({ comments, rootPost, activeCommentId, onNodeClick }: CommentTreeProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !rootPost) return;

    // Build hierarchy
    const rootData = {
      id: rootPost.id,
      content: rootPost.title,
      type: 'post',
      status: rootPost.status,
      children: [] as any[]
    };

    const commentMap = new Map<string, any>();
    comments.forEach(c => {
      commentMap.set(c.id, {
        ...c,
        type: 'comment',
        status: c.postStatus,
        children: []
      });
    });

    comments.forEach(c => {
      const node = commentMap.get(c.id);
      if (c.parentId === rootPost.id) {
        rootData.children.push(node);
      } else {
        const parent = commentMap.get(c.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          rootData.children.push(node);
        }
      }
    });

    const width = 800;
    const height = 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Create a container for everything to allow zooming
    const zoomContainer = svg.append("g");

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => {
        zoomContainer.attr("transform", event.transform);
      });

    svg.call(zoom);

    const tree = d3.tree().nodeSize([180, 120]); // Fixed separation between nodes
    const hierarchy = d3.hierarchy(rootData);
    const treeData = tree(hierarchy);

    // Center the content initially
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, 80).scale(0.8));

    // Links (Top-down layout uses x for horizontal and y for vertical)
    zoomContainer.selectAll(".link")
        .data(treeData.links())
        .enter().append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#334155")
        .attr("stroke-width", 2)
        .attr("d", d3.linkVertical()
            .x((d: any) => d.x)
            .y((d: any) => d.y) as any);

    // Nodes
    const nodes = zoomContainer.selectAll(".node")
        .data(treeData.descendants())
        .enter().append("g")
        .attr("class", d => "node" + (d.children ? " node--internal" : " node--leaf"))
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`)
        .on("click", (event, d: any) => {
            if (d.data.type === 'comment' && onNodeClick) {
                onNodeClick(d.data.id);
            }
        });

    nodes.append("circle")
        .attr("r", 8)
        .attr("fill", (d: any) => {
            if (d.data.id === activeCommentId) return "#818cf8"; // Brighter highlight
            if (d.data.status === 'published') return "#10b981"; // Green
            if (d.data.status === 'coding') return "#f59e0b"; // Yellow
            return "#0f172a"; // Black/Dark
        })
        .attr("stroke", (d: any) => d.data.id === activeCommentId ? "#ffffff" : "#1e293b")
        .attr("stroke-width", 3)
        .attr("class", "cursor-pointer transition-all hover:scale-125 duration-200");

    // Text truncation logic with 2 lines
    const textGroup = nodes.append("g")
        .attr("transform", "translate(0, 25)")
        .attr("class", "pointer-events-none select-none");

    textGroup.append("text")
        .attr("text-anchor", "middle")
        .attr("fill", "#e2e8f0")
        .attr("font-size", "10px")
        .attr("font-weight", "600")
        .attr("class", "font-mono")
        .text((d: any) => {
          const content = d.data.content || "";
          return content.length > 15 ? content.substring(0, 15) : content;
        });

    textGroup.append("text")
        .attr("dy", "1.2em")
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", "9px")
        .attr("class", "font-mono")
        .text((d: any) => {
          const content = d.data.content || "";
          if (content.length <= 15) return "";
          return content.substring(15, 30) + (content.length > 30 ? "..." : "");
        });

    // Arrow for active node
    nodes.filter((d: any) => d.data.id === activeCommentId)
        .append("path")
        .attr("d", "M-15,-20 L0,-10 L15,-20") // V-shaped arrow pointing down
        .attr("fill", "none")
        .attr("stroke", "#818cf8")
        .attr("stroke-width", 3)
        .attr("class", "animate-bounce")
        .attr("transform", "translate(0, -5)");

  }, [comments, rootPost, activeCommentId, onNodeClick]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-bg-surface/50 rounded-2xl border border-border-subtle overflow-hidden cursor-grab active:cursor-grabbing group">
        <svg ref={svgRef} className="w-full h-full touch-none" />
    </div>
  );
};
