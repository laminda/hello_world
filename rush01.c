void	ft_putchar(char c);

void	ft_line(char start, char middle, char finish, int x)
{
	int	width;

	width = 1;
	while (width <= x)
	{
		if (width == 1)
		{
			ft_putchar(start);
		}
		if ((width != 1) && (width < x))
		{
			ft_putchar(middle);
		}
		if ((width == x) && (x != 1))
		{
			ft_putchar(finish);
		}
		width++;
	}
}

void	rush(int x, int y)
{
	int	height;

	height = 1;
	while (height <= y)
	{
		if (height == 1)
		{
			ft_line('/', '*', '\\', x);
		}
		if ((height != 1) && (height < y))
		{
			ft_line('*', ' ', '*', x);
		}
		if ((height == y) && (y != 1))
		{
			ft_line('\\', '*', '/', x);
		}
		height++;
		ft_putchar('\n');
	}
}
