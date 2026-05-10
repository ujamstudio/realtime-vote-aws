// Single-node cache.t4g.micro, no cluster mode (cheapest viable for 200 CCU).
// Encryption-in-transit disabled to keep redis-py config minimal; flip on for prod-grade.

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.project}-redis-subnets"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_cluster" "this" {
  cluster_id           = "${var.project}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.this.name
  security_group_ids   = [aws_security_group.redis.id]
}
