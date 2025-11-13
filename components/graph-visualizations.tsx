import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { genreData, timelineData, mockUserCommunities } from "@/lib/mock-data";
import { BarChart3, Users, Clock, Film } from "lucide-react";

// Simple chart components since we don't have Chart.js properly imported
function GenreChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = 300;
    canvas.height = 200;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw simple donut chart
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 70;
    const innerRadius = 40;

    let currentAngle = -Math.PI / 2;

    genreData.forEach((genre) => {
      const sliceAngle = (genre.value / 100) * 2 * Math.PI;
      
      // Draw outer arc
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
      ctx.closePath();
      ctx.fillStyle = genre.color;
      ctx.fill();
      
      currentAngle += sliceAngle;
    });
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

function TimelineChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 150;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 40;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    const maxValue = Math.max(...timelineData.map(d => d.movies));

    // Draw axes
    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 1;
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.stroke();
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // Draw line
    ctx.strokeStyle = "#8B5CF6";
    ctx.lineWidth = 2;
    ctx.beginPath();

    timelineData.forEach((point, index) => {
      const x = padding + (index / (timelineData.length - 1)) * chartWidth;
      const y = canvas.height - padding - (point.movies / maxValue) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw points
    ctx.fillStyle = "#8B5CF6";
    timelineData.forEach((point, index) => {
      const x = padding + (index / (timelineData.length - 1)) * chartWidth;
      const y = canvas.height - padding - (point.movies / maxValue) * chartHeight;
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

function NetworkGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 300;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Draw connections
    const connections = [
      { from: [centerX, centerY], to: [centerX - 80, centerY - 60] },
      { from: [centerX, centerY], to: [centerX + 80, centerY - 60] },
      { from: [centerX, centerY], to: [centerX + 80, centerY + 60] },
      { from: [centerX, centerY], to: [centerX - 80, centerY + 60] },
    ];

    ctx.strokeStyle = "#8B5CF6";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;

    connections.forEach(conn => {
      ctx.beginPath();
      ctx.moveTo(conn.from[0], conn.from[1]);
      ctx.lineTo(conn.to[0], conn.to[1]);
      ctx.stroke();
    });

    ctx.globalAlpha = 1;

    // Draw nodes
    const nodes = [
      { x: centerX, y: centerY, color: "#1E40AF", size: 20 }, // User
      { x: centerX - 80, y: centerY - 60, color: "#8B5CF6", size: 12 }, // Genre nodes
      { x: centerX + 80, y: centerY - 60, color: "#F59E0B", size: 12 },
      { x: centerX + 80, y: centerY + 60, color: "#10B981", size: 12 },
      { x: centerX - 80, y: centerY + 60, color: "#EC4899", size: 12 },
    ];

    nodes.forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();
    });
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

interface GraphVisualizationsProps {
  className?: string;
}

export default function GraphVisualizations({ className }: GraphVisualizationsProps) {
  return (
    <div className={className}>
      {/* User Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Movies Watched</p>
                <p className="text-2xl font-bold text-primary">247</p>
              </div>
              <Film className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Watch Time</p>
                <p className="text-2xl font-bold text-accent">412h</p>
              </div>
              <Clock className="h-8 w-8 text-accent" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Rating</p>
                <p className="text-2xl font-bold text-rating">4.2</p>
              </div>
              <BarChart3 className="h-8 w-8 text-rating" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Communities</p>
                <p className="text-2xl font-bold text-green-400">8</p>
              </div>
              <Users className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Genre Preference Chart */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            <span>Genre Preference Network</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-muted/30 rounded-lg flex items-center justify-center mb-4">
            <GenreChart />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {genreData.map((genre) => (
              <div key={genre.name} className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: genre.color }}
                />
                <span>{genre.name} ({genre.value}%)</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Community Detection and Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-accent" />
              <span>Your Movie Communities</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockUserCommunities.slice(0, 2).map((community) => (
                <div key={community.id} className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">{community.communityName}</h4>
                    <Badge variant="secondary" className="bg-primary/20 text-primary">
                      {community.matchPercentage}% match
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {community.memberCount.toLocaleString()} members who share your taste
                  </p>
                  <div className="flex items-center space-x-2">
                    <div className="flex -space-x-2">
                      {[1, 2, 3].map((i) => (
                        <Avatar key={i} className="w-6 h-6 border-2 border-background">
                          <AvatarImage src={`https://images.unsplash.com/photo-${1472099645785 + i}?w=32&h=32&fit=crop`} />
                          <AvatarFallback>{i}</AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      +{(community.memberCount - 3).toLocaleString()} more
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-accent" />
              <span>Viewing Pattern Timeline</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-36 bg-muted/30 rounded-lg flex items-center justify-center mb-4">
              <TimelineChart />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>• Peak viewing: Weekends 8-11 PM</p>
              <p>• Favorite genres shift by season</p>
              <p>• Binge-watching patterns detected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Network Graph */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            <span>Recommendation Connection Graph</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 bg-muted/30 rounded-lg flex items-center justify-center mb-4">
            <NetworkGraph />
          </div>
          <p className="text-sm text-muted-foreground">
            Interactive graph showing how your preferences connect to movie recommendations through 
            genre relationships and collaborative filtering algorithms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
