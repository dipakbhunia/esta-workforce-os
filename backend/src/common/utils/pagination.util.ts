import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PaginatedResult } from '../interfaces/paginated-result.interface';

export function paginationArgs(query: PaginationQueryDto): {
  skip: number;
  take: number;
} {
  return {
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  };
}

export function paginatedResult<T>(
  data: T[],
  total: number,
  query: PaginationQueryDto,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}
